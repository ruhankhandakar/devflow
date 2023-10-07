'use server';
import { revalidatePath } from 'next/cache';

import { connectToDatabase } from '../mongoose';
import Question from '@/database/question.model';
import User from '@/database/user.model';
import Tag from '@/database/tag.model';
import {
  CreateQuestionParams,
  DeleteQuestionParams,
  EditQuestionParams,
  GetQuestionByIdParams,
  GetQuestionsParams,
  QuestionVoteParams,
} from './shared.types';
import { QuestionData } from '@/types';
import Answer from '@/database/answer.model';
import InterAction from '@/database/interaction.model';

export async function getQuestions(params?: GetQuestionsParams) {
  try {
    // Connect to DB
    await connectToDatabase();

    const questions = (await Question.find({})
      .populate({
        path: 'tags',
        model: Tag,
      })
      .populate({
        path: 'author',
        model: User,
      })) as QuestionData[];
    return { questions };
  } catch (error) {
    console.error('getQuestions', error);
    throw error;
  }
}

export async function createQuestion(params: CreateQuestionParams) {
  try {
    // Connect to DB
    await connectToDatabase();

    const { title, content, tags, author, path } = params;

    // Create a new Question
    const question = await Question.create({
      title,
      content,
      author,
    });

    const tagsDocuments = [];

    // Create the tags or get the tags from the DB
    for (const tag of tags) {
      const existingTag = await Tag.findOneAndUpdate(
        {
          name: {
            $regex: new RegExp(`^${tag}$`, 'i'),
          },
        },
        {
          $setOnInsert: {
            name: tag,
          },
          $push: {
            questions: question._id,
          },
        },
        {
          upsert: true,
          new: true,
        }
      );
      tagsDocuments.push(existingTag._id);
    }

    await Question.findByIdAndUpdate(question._id, {
      $push: {
        tags: {
          $each: tagsDocuments,
        },
      },
    });

    // Increment author's reputation by +5 for creating new question

    revalidatePath(path);
  } catch (error) {}
}

export async function getQuestionById(params: GetQuestionByIdParams) {
  try {
    // Connect to DB
    await connectToDatabase();

    const { questionId } = params;

    const question = (await Question.findById(questionId)
      .populate({
        path: 'tags',
        model: Tag,
        select: '_id name',
      })
      .populate({
        path: 'author',
        model: User,
        select: '_id clerkId name picture',
      })) as QuestionData;
    return { question };
  } catch (error) {
    console.error('getQuestionById', error);
    throw error;
  }
}

export async function upvoteQuestion(parms: QuestionVoteParams) {
  try {
    // Connect to DB
    await connectToDatabase();

    const { questionId, userId, path, hasdownVoted, hasupVoted } = parms;

    let updateQuery = {};
    if (hasupVoted) {
      updateQuery = {
        $pull: {
          upvotes: userId,
        },
      };
    } else if (hasdownVoted) {
      updateQuery = {
        $pull: {
          downvotes: userId,
        },
        $push: {
          upvotes: userId,
        },
      };
    } else {
      updateQuery = {
        $addToSet: {
          upvotes: userId,
        },
      };
    }

    const question = await Question.findByIdAndUpdate(questionId, updateQuery, {
      new: true,
    });

    if (!question) {
      throw new Error('question not found');
    }

    // Increment author's reputation by +10 for upvoting a question

    revalidatePath(path);
  } catch (error) {
    console.error('upvoteQuestion', error);
    throw error;
  }
}

export async function downvoteQuestion(parms: QuestionVoteParams) {
  try {
    // Connect to DB
    await connectToDatabase();

    const { questionId, userId, path, hasdownVoted, hasupVoted } = parms;

    let updateQuery = {};
    if (hasdownVoted) {
      updateQuery = {
        $pull: {
          downvotes: userId,
        },
      };
    } else if (hasupVoted) {
      updateQuery = {
        $pull: {
          upvotes: userId,
        },
        $push: {
          downvotes: userId,
        },
      };
    } else {
      updateQuery = {
        $addToSet: {
          downvotes: userId,
        },
      };
    }

    const question = await Question.findByIdAndUpdate(questionId, updateQuery, {
      new: true,
    });

    if (!question) {
      throw new Error('question not found');
    }

    // Increment author's reputation by +10 for upvoting a question

    revalidatePath(path);
  } catch (error) {
    console.error('downvoteQuestion', error);
    throw error;
  }
}

export async function deleteQuestion(params: DeleteQuestionParams) {
  try {
    // Connect to DB
    await connectToDatabase();

    const { questionId, path } = params;

    await Question.deleteOne({ _id: questionId });
    await Answer.deleteMany({ question: questionId });
    await InterAction.deleteMany({ question: questionId });
    await Tag.updateMany(
      { questions: questionId },
      {
        $pull: {
          questions: questionId,
        },
      }
    );

    revalidatePath(path);
  } catch (error) {
    console.error('deleteQuestion', error);
    throw error;
  }
}

export async function editQuestion(params: EditQuestionParams) {
  try {
    // Connect to DB
    await connectToDatabase();

    const { questionId, title, content, path } = params;

    const question = await Question.findById(questionId).populate('tags');

    if (!question) throw new Error('Question not found');

    question.title = title;
    question.content = content;

    await question.save();

    revalidatePath(path);
  } catch (error) {
    console.error('editQuestion', error);
    throw error;
  }
}
